#!/usr/bin/env node

import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, dirname, join} from 'node:path';

import {
  DISTRIBUTED_EXECUTION_ENV,
  DISTRIBUTED_EXECUTION_TARGET,
  DISTRIBUTED_MATRIX_PROFILE,
  DISTRIBUTED_MATRIX_REPORT_ROOT,
} from '../test/distributed/harness/constants.js';
import {
  buildDistributedMatrixExecutionPlan,
  buildGcpTargetConfig,
} from '../test/distributed/harness/distributed-matrix-plan.js';
import {runHarness} from './lab/harness.js';
import {
  loadState,
  selectNodesByRole,
} from './lab/state.js';
import {run} from './lab/process.js';

const MATRIX_RUNNER = 'test/distributed/run.js';
const MATRIX_SUMMARIZER = 'scripts/summarize-harness-runs.js';
const MATRIX_CONFIG_TEXT_ENCODING = 'utf8';
const MATRIX_CONFIG_JSON_INDENT = 2;
const MATRIX_NEWLINE = '\n';
const MATRIX_SPACE = ' ';
const MATRIX_LIST_SEPARATOR = ',';
const MATRIX_RUN_ID_SEPARATOR = '-';
const MATRIX_RUN_ID_PATTERN = /[:.]/gu;
const MATRIX_TEMP_PREFIX = 'lagrange-distributed-matrix-';
const MATRIX_TEMP_CONFIG_SUFFIX = '.json';
const MATRIX_ROLE_HARNESS = 'harness';
const MATRIX_EXIT_SUCCESS = 0;
const MATRIX_EXIT_FAILURE = 1;
const MATRIX_FIRST_POSITION = 0;
const MATRIX_FLAG_VALUE_OFFSET = 1;
const MATRIX_MIN_POSITIVE_INTEGER = 1;
const MATRIX_EMPTY = '';
const MATRIX_PASSTHROUGH_MARKER = '--';
const MATRIX_STATUS_PASS = 'PASS';
const MATRIX_STATUS_FAIL = 'FAIL';
const MATRIX_STATUS_DRY = 'DRY';
const MATRIX_DEFAULT_GCP_TEMPLATE =
  'test/distributed/config/gcp-default.json';
const MATRIX_RUNNER_FLAG_CONFIG = '--config';
const MATRIX_RUNNER_FLAG_SCENARIO = '--scenario';
const MATRIX_RUNNER_FLAG_OUTPUT = '--output';
const MATRIX_SUMMARY_FLAG_REPORT_DIR = '--report-dir';

const MATRIX_FLAG = Object.freeze({
  TARGET: '--target',
  PROFILE: '--profile',
  NODES: '--nodes',
  NODES_PER_HOST: '--nodes-per-host',
  GCP_TEMPLATE: '--gcp-template',
  REPORT_ROOT: '--report-root',
  DRY_RUN: '--dry-run',
  HELP: '--help',
});
const MATRIX_RESERVED_PASSTHROUGH = Object.freeze([
  MATRIX_RUNNER_FLAG_CONFIG,
  MATRIX_RUNNER_FLAG_SCENARIO,
  MATRIX_RUNNER_FLAG_OUTPUT,
]);
const MATRIX_USAGE = [
  'Distributed scenario matrix\n\n',
  '  node scripts/run-distributed-matrix.js ',
  '[--target local|lab|gcp] ',
  '[--profile canonical|topology] ',
  '[--nodes a,b,c] ',
  '[--nodes-per-host N] ',
  '[--gcp-template CONFIG] ',
  '[--report-root DIR] ',
  '[--dry-run] ',
  '[-- ...distributed-runner args]\n\n',
  'The scenario matrix is always owned by ',
  'test/distributed/harness/scenario-registry.js.\n',
  'Targets only change where those scenarios execute.\n',
].join(MATRIX_EMPTY);

function createRunId() {
  return new Date().toISOString().replace(
    MATRIX_RUN_ID_PATTERN,
    MATRIX_RUN_ID_SEPARATOR,
  );
}

function csv(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(MATRIX_LIST_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parsePositiveInteger(value, flag) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) ||
      normalized < MATRIX_MIN_POSITIVE_INTEGER) {
    throw new Error(`${flag} requires a positive integer`);
  }
  return normalized;
}

function parseArgs(argv) {
  const parsed = {
    target: DISTRIBUTED_EXECUTION_TARGET.LOCAL,
    profile: DISTRIBUTED_MATRIX_PROFILE.CANONICAL,
    nodes: [],
    nodesPerHost: undefined,
    gcpTemplate: MATRIX_DEFAULT_GCP_TEMPLATE,
    reportRoot: DISTRIBUTED_MATRIX_REPORT_ROOT,
    dryRun: false,
    help: false,
    passthrough: [],
  };
  let passthrough = false;

  for (let index = MATRIX_FIRST_POSITION; index < argv.length; index += 1) {
    const arg = argv[index];
    if (passthrough) {
      parsed.passthrough.push(arg);
      continue;
    }
    if (arg === MATRIX_PASSTHROUGH_MARKER) {
      passthrough = true;
      continue;
    }
    const next = argv[index + MATRIX_FLAG_VALUE_OFFSET];
    if (arg === MATRIX_FLAG.TARGET && next) {
      parsed.target = next;
      index += MATRIX_FLAG_VALUE_OFFSET;
    } else if (arg === MATRIX_FLAG.PROFILE && next) {
      parsed.profile = next;
      index += MATRIX_FLAG_VALUE_OFFSET;
    } else if (arg === MATRIX_FLAG.NODES && next) {
      parsed.nodes = csv(next);
      index += MATRIX_FLAG_VALUE_OFFSET;
    } else if (arg === MATRIX_FLAG.NODES_PER_HOST && next) {
      parsed.nodesPerHost = parsePositiveInteger(next, arg);
      index += MATRIX_FLAG_VALUE_OFFSET;
    } else if (arg === MATRIX_FLAG.GCP_TEMPLATE && next) {
      parsed.gcpTemplate = next;
      index += MATRIX_FLAG_VALUE_OFFSET;
    } else if (arg === MATRIX_FLAG.REPORT_ROOT && next) {
      parsed.reportRoot = next;
      index += MATRIX_FLAG_VALUE_OFFSET;
    } else if (arg === MATRIX_FLAG.DRY_RUN) {
      parsed.dryRun = true;
    } else if (arg === MATRIX_FLAG.HELP) {
      parsed.help = true;
    } else {
      parsed.passthrough.push(arg);
    }
  }

  return parsed;
}

function assertPassthroughAuthority(passthrough) {
  const forbidden = passthrough.find((entry) =>
    MATRIX_RESERVED_PASSTHROUGH.includes(entry),
  );
  if (forbidden) {
    throw new Error(
      `${forbidden} is owned by the distributed matrix runner`,
    );
  }
}

function formatCommand(command, args) {
  return [command, ...args.map((arg) => JSON.stringify(String(arg)))]
    .join(MATRIX_SPACE);
}

function matrixEnvironment(args, hostNames = []) {
  const environment = {
    ...process.env,
    [DISTRIBUTED_EXECUTION_ENV.TARGET]: args.target,
    [DISTRIBUTED_EXECUTION_ENV.PROFILE]: args.profile,
  };
  if (hostNames.length > 0) {
    environment[DISTRIBUTED_EXECUTION_ENV.HOSTS] =
      hostNames.join(MATRIX_LIST_SEPARATOR);
  }
  return environment;
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, MATRIX_CONFIG_TEXT_ENCODING));
}

async function createGcpConfigResolver(templatePath, temporaryDirectory) {
  const template = await loadJson(templatePath);
  const cache = new Map();

  return async (baseConfigPath) => {
    if (cache.has(baseConfigPath)) {
      return cache.get(baseConfigPath);
    }
    const base = await loadJson(baseConfigPath);
    const configured = buildGcpTargetConfig(base, template);
    const outputPath = join(
      temporaryDirectory,
      basename(baseConfigPath, MATRIX_TEMP_CONFIG_SUFFIX) +
        MATRIX_TEMP_CONFIG_SUFFIX,
    );
    await writeFile(
      outputPath,
      JSON.stringify(configured, null, MATRIX_CONFIG_JSON_INDENT) +
        MATRIX_NEWLINE,
      MATRIX_CONFIG_TEXT_ENCODING,
    );
    cache.set(baseConfigPath, outputPath);
    return outputPath;
  };
}

function runnerArgs(entry, configPath, passthrough) {
  return [
    MATRIX_RUNNER,
    ...passthrough,
    MATRIX_RUNNER_FLAG_CONFIG,
    configPath,
    MATRIX_RUNNER_FLAG_SCENARIO,
    entry.scenario,
    MATRIX_RUNNER_FLAG_OUTPUT,
    entry.outputPath,
  ];
}

async function executeProcessEntry({
  entry,
  configPath,
  args,
  environment,
}) {
  const childArgs = runnerArgs(entry, configPath, args.passthrough);
  if (args.dryRun) {
    process.stdout.write(
      formatCommand(process.execPath, childArgs) + MATRIX_NEWLINE,
    );
    return;
  }
  await mkdir(dirname(entry.outputPath), {recursive: true});
  await run(process.execPath, childArgs, {env: environment});
}

async function executeLabEntry({
  entry,
  args,
  nodes,
  environment,
}) {
  if (args.dryRun) {
    process.stdout.write(
      `lab ${entry.scenario} <- ${entry.configPath}${MATRIX_NEWLINE}`,
    );
  } else {
    await mkdir(dirname(entry.outputPath), {recursive: true});
  }
  await runHarness({
    nodes,
    scenario: entry.scenario,
    baseConfig: entry.configPath,
    nodesPerHost: args.nodesPerHost,
    dryRun: args.dryRun,
    extraArgs: [
      MATRIX_RUNNER_FLAG_OUTPUT,
      entry.outputPath,
      ...args.passthrough,
    ],
    environment,
  });
}

async function summarize(reportDirectory) {
  try {
    await run(process.execPath, [
      MATRIX_SUMMARIZER,
      MATRIX_SUMMARY_FLAG_REPORT_DIR,
      reportDirectory,
    ]);
  } catch (error) {
    process.stderr.write(
      `matrix summary failed: ${error.message}${MATRIX_NEWLINE}`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(MATRIX_FLAG_VALUE_OFFSET + 1));
  if (args.help) {
    process.stdout.write(MATRIX_USAGE);
    return;
  }
  assertPassthroughAuthority(args.passthrough);

  const runId = createRunId();
  const plan = buildDistributedMatrixExecutionPlan({
    target: args.target,
    profile: args.profile,
    runId,
    reportRoot: args.reportRoot,
  });
  const reportDirectory = dirname(plan[MATRIX_FIRST_POSITION].outputPath);

  let labNodes = [];
  if (args.target === DISTRIBUTED_EXECUTION_TARGET.LAB) {
    const state = await loadState();
    labNodes = selectNodesByRole(
      state,
      MATRIX_ROLE_HARNESS,
      args.nodes,
    );
  }
  const environment = matrixEnvironment(
    args,
    labNodes.map((node) => node.name),
  );

  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), MATRIX_TEMP_PREFIX),
  );
  let resolveGcpConfig = null;
  try {
    if (args.target === DISTRIBUTED_EXECUTION_TARGET.GCP) {
      resolveGcpConfig = await createGcpConfigResolver(
        args.gcpTemplate,
        temporaryDirectory,
      );
    }

    let passed = 0;
    const failed = [];
    for (const entry of plan) {
      process.stdout.write(
        `[${entry.index}/${entry.total}] ` +
        `${entry.target}/${entry.profile} ` +
        `${entry.scenario} (${entry.config})${MATRIX_NEWLINE}`,
      );
      try {
        if (args.target === DISTRIBUTED_EXECUTION_TARGET.LAB) {
          await executeLabEntry({
            entry,
            args,
            nodes: labNodes,
            environment,
          });
        } else {
          const configPath =
            args.target === DISTRIBUTED_EXECUTION_TARGET.GCP ?
              await resolveGcpConfig(entry.configPath) :
              entry.configPath;
          await executeProcessEntry({
            entry,
            configPath,
            args,
            environment,
          });
        }
        passed += MATRIX_MIN_POSITIVE_INTEGER;
        process.stdout.write(
          `  -> ${args.dryRun ? MATRIX_STATUS_DRY : MATRIX_STATUS_PASS}` +
          MATRIX_NEWLINE,
        );
      } catch (error) {
        failed.push({
          scenario: entry.scenario,
          config: entry.config,
          error: error.message,
        });
        process.stderr.write(
          `  -> ${MATRIX_STATUS_FAIL}: ${error.message}${MATRIX_NEWLINE}`,
        );
      }
    }

    process.stdout.write(
      `Distributed matrix: ${passed} passed, ${failed.length} failed, ` +
      `${plan.length} total${MATRIX_NEWLINE}`,
    );
    if (!args.dryRun) {
      await summarize(reportDirectory);
    }
    process.exitCode =
      failed.length > MATRIX_FIRST_POSITION ?
        MATRIX_EXIT_FAILURE :
        MATRIX_EXIT_SUCCESS;
  } finally {
    await rm(temporaryDirectory, {recursive: true, force: true});
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error.stack || error.message}${MATRIX_NEWLINE}`,
  );
  process.exitCode = MATRIX_EXIT_FAILURE;
});
