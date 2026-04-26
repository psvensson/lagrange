#!/usr/bin/env node

import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  DEFAULT_SCENARIO,
  DEFAULT_SHIP_GATE,
  extractNodeJoinLoadMetrics,
  summarizeValidationRuns,
  assessShipReadiness,
} from './harness/validation-matrix.js';

const RUNNER_PATH = resolve('test/distributed/run.js');
const DEFAULT_CONFIG_PATH = resolve('test/distributed/config/local.json');
const DEFAULT_RUN_COUNT = 3;
const DEFAULT_SEED_START = 7001;
const DEFAULT_SEED_STEP = 97;
const OUTPUT_FILE_SUFFIX = '.validation.json';
const UTF8 = 'utf8';
const ZERO = 0;

function parsePositiveInteger(value, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= ZERO) {
    return fallback;
  }
  return Math.floor(numericValue);
}

function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[-:.]/g, '').replace('Z', 'Z');
}

function buildDefaultOutputPath() {
  const stamp = timestampSlug();
  return resolve(
    'test-output/reports',
    `node-join-under-load-validation-${stamp}${OUTPUT_FILE_SUFFIX}`,
  );
}

function parseArgs(argv) {
  const parsed = {
    config: DEFAULT_CONFIG_PATH,
    scenario: DEFAULT_SCENARIO,
    runs: DEFAULT_RUN_COUNT,
    seedStart: DEFAULT_SEED_START,
    seedStep: DEFAULT_SEED_STEP,
    output: buildDefaultOutputPath(),
    verbose: false,
  };

  for (let index = ZERO; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--config' && index + 1 < argv.length) {
      parsed.config = resolve(argv[++index]);
    } else if (arg === '--scenario' && index + 1 < argv.length) {
      parsed.scenario = String(argv[++index] || DEFAULT_SCENARIO);
    } else if (arg === '--runs' && index + 1 < argv.length) {
      parsed.runs = parsePositiveInteger(argv[++index], DEFAULT_RUN_COUNT);
    } else if (arg === '--seed-start' && index + 1 < argv.length) {
      parsed.seedStart = parsePositiveInteger(
        argv[++index],
        DEFAULT_SEED_START,
      );
    } else if (arg === '--seed-step' && index + 1 < argv.length) {
      parsed.seedStep = parsePositiveInteger(argv[++index], DEFAULT_SEED_STEP);
    } else if (arg === '--output' && index + 1 < argv.length) {
      parsed.output = resolve(argv[++index]);
    } else if (arg === '--verbose') {
      parsed.verbose = true;
    }
  }

  return parsed;
}

function runNodeProcess(args, options = {}) {
  const inheritStdout = options.inheritStdout === true;
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, args, {
      stdio: inheritStdout ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    if (!inheritStdout) {
      child.stdout?.on('data', (chunk) => {
        stdout += String(chunk || '');
      });
      child.stderr?.on('data', (chunk) => {
        stderr += String(chunk || '');
      });
    }

    child.on('close', (code) => {
      resolvePromise({
        code: Number.isInteger(code) ? code : 1,
        stdout,
        stderr,
      });
    });
  });
}

function resolveScenarioResult(report, scenarioName) {
  const scenarios = Array.isArray(report?.scenarios) ? report.scenarios : [];
  return scenarios.find((entry) => entry?.scenario === scenarioName) || null;
}

function resolveFailureAttributionFromScenarioResult(scenarioResult) {
  const failureFromDetails =
    scenarioResult?.details?.diagnostics?.failure &&
    typeof scenarioResult.details.diagnostics.failure === 'object' ?
      scenarioResult.details.diagnostics.failure :
      null;
  return {
    rootCauseClass:
      scenarioResult?.failureBundle?.summary?.rootCauseClass ||
      failureFromDetails?.rootCauseClass ||
      null,
    dominantReason:
      scenarioResult?.failureBundle?.summary?.dominantReason ||
      failureFromDetails?.dominantReason ||
      null,
  };
}

function withDeterministicSeed(baseConfig, seed) {
  const existing =
    baseConfig?.deterministicDebug &&
    typeof baseConfig.deterministicDebug === 'object' ?
      baseConfig.deterministicDebug :
      {};
  return {
    ...baseConfig,
    deterministicDebug: {
      ...existing,
      enabled: true,
      seed,
    },
  };
}

async function executeValidationRun(runOptions) {
  const {
    configPath,
    scenario,
    runIndex,
    seed,
    tempConfigDir,
    outputDir,
    verbose,
  } = runOptions;
  const runName = `run-${runIndex + 1}-seed-${seed}`;
  const reportPath = resolve(outputDir, `${scenario}-${runName}.report.json`);
  const tempConfigPath = resolve(tempConfigDir, `${runName}.config.json`);
  const baseConfig = JSON.parse(await readFile(configPath, UTF8));
  const seededConfig = withDeterministicSeed(baseConfig, seed);
  await writeFile(
    tempConfigPath,
    JSON.stringify(seededConfig, null, 2) + '\n',
    UTF8,
  );

  const commandArgs = [
    RUNNER_PATH,
    '--config',
    tempConfigPath,
    '--scenario',
    scenario,
    '--output',
    reportPath,
    '--deterministic-debug',
  ];
  if (verbose) {
    commandArgs.push('--verbose');
  }
  const execution = await runNodeProcess(commandArgs, {
    inheritStdout: verbose,
  });

  let report = null;
  try {
    report = JSON.parse(await readFile(reportPath, UTF8));
  } catch (_error) {
    report = null;
  }
  const scenarioResult = resolveScenarioResult(report, scenario);
  const failureAttribution =
    resolveFailureAttributionFromScenarioResult(scenarioResult);
  return {
    runIndex: runIndex + 1,
    seed,
    exitCode: execution.code,
    reportPath,
    passed: scenarioResult?.passed === true,
    error: scenarioResult?.error || null,
    rootCauseClass: failureAttribution.rootCauseClass,
    dominantReason: failureAttribution.dominantReason,
    metrics: extractNodeJoinLoadMetrics(report, scenario),
  };
}

async function runValidationMatrix(options) {
  const scenario = String(options.scenario || DEFAULT_SCENARIO);
  const runCount = parsePositiveInteger(options.runs, DEFAULT_RUN_COUNT);
  const seedStart = parsePositiveInteger(options.seedStart, DEFAULT_SEED_START);
  const seedStep = parsePositiveInteger(options.seedStep, DEFAULT_SEED_STEP);
  const outputPath = resolve(options.output || buildDefaultOutputPath());
  const configPath = resolve(options.config || DEFAULT_CONFIG_PATH);
  const outputDir = dirname(outputPath);
  await mkdir(outputDir, {recursive: true});

  const tempConfigDir = await mkdtemp(
    join(tmpdir(), 'node-join-validation-config-'),
  );
  const runResults = [];
  try {
    for (let runIndex = ZERO; runIndex < runCount; runIndex++) {
      const seed = seedStart + runIndex * seedStep;
      process.stdout.write(
        `[validation] ${scenario} run ${runIndex + 1}/${runCount} seed=${seed}\n`,
      );
      const runResult = await executeValidationRun({
        configPath,
        scenario,
        runIndex,
        seed,
        tempConfigDir,
        outputDir,
        verbose: options.verbose === true,
      });
      runResults.push(runResult);
      process.stdout.write(
        `[validation] result run=${runResult.runIndex} ` +
          `exit=${runResult.exitCode} passed=${runResult.passed}\n`,
      );
    }
  } finally {
    await rm(tempConfigDir, {recursive: true, force: true});
  }

  const summary = summarizeValidationRuns(runResults);
  const validationGate = assessShipReadiness(summary, {
    minimumRuns: Math.min(DEFAULT_SHIP_GATE.minimumRuns, Math.max(1, runCount)),
  });
  const shipReadinessGate = assessShipReadiness(summary);
  const payload = {
    generatedAt: new Date().toISOString(),
    scenario,
    configPath,
    runCountRequested: runCount,
    seedStart,
    seedStep,
    runResults,
    summary,
    validationGate,
    shipReadinessGate,
  };

  await writeFile(outputPath, JSON.stringify(payload, null, 2) + '\n', UTF8);

  process.stdout.write(`[validation] output: ${outputPath}\n`);
  process.stdout.write(
    `[validation] runs=${summary.totalRuns} pass=${summary.passedRuns} ` +
      `fail=${summary.failedRuns} failureRate=${summary.failureRate}\n`,
  );
  process.stdout.write(
    `[validation] decision=${validationGate.decision} ` +
      `failed-criteria=${validationGate.failedCriteria.length}\n`,
  );
  process.stdout.write(
    `[validation] ship-decision=${shipReadinessGate.decision} ` +
      `failed-criteria=${shipReadinessGate.failedCriteria.length}\n`,
  );

  return {
    outputPath,
    summary,
    gate: validationGate,
    shipReadinessGate,
    runResults,
  };
}

const isMainModule =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const args = parseArgs(process.argv.slice(2));
  runValidationMatrix(args)
    .then((result) => {
      process.exitCode = result.gate.decision === 'ship' ? 0 : 1;
    })
    .catch((error) => {
      process.stderr.write(`[validation] fatal: ${error.message}\n`);
      process.exitCode = 1;
    });
}

export {parseArgs, runValidationMatrix};
