#!/usr/bin/env node

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';

const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_128KJ = ', ';
const LOCAL_STR_HYPHEN = '-';
const LOCAL_STR_HIGH = 'high';
const LOCAL_STR_SCENARIO_FAILURE = 'scenario_failure';
const LOCAL_STR_FAILED = 'failed';
const LOCAL_STR_1Y1O3 = 'benchmark_regression_gate_failure';
const LOCAL_STR_UNKNOWN = 'unknown';
const LOCAL_STR_1XCQE = 'benchmark_pipeline_passed';
const LOCAL_STR_OK = 'ok';
const LOCAL_STR_CN3IO = 'benchmark pipeline did not pass';
const LOCAL_STR_ENJ8X = 'standard_profiles_present';
const LOCAL_STR_CQURS = '3-node and 5-node benchmark reports present';
const LOCAL_STR_192AS = 'missing standardized profile(s)';
const LOCAL_STR_NO_HIGH_INCIDENTS = 'no_high_incidents';
const LOCAL_STR_I70OS = 'no high-severity incidents detected';
const LOCAL_STR_1J8HJ = 'rollback_drill_passed';
const LOCAL_STR_OZF4W = 'rollback drill summary passed';
const LOCAL_STR_NISIJ = 'rollback drill summary missing or failed';
const LOCAL_NUM_TWO = 2;
const LOCAL_STR_UTF8 = 'utf8';

const STAGE = Object.freeze({
  DEV: 'dev',
  CANARY: 'canary',
  LIMITED_PRODUCTION: 'limited-production',
});
const STAGES = Object.freeze(Object.values(STAGE));

const ARG = Object.freeze({
  STAGE: '--stage',
  BENCHMARK_SUMMARY: '--benchmark-summary',
  ROLLBACK_SUMMARY: '--rollback-summary',
});

const DEFAULT_PATH = Object.freeze({
  reportRoot: '.kiro/specs/raft-logic-migration/reports/stages',
  benchmarkSummary:
    '.kiro/specs/raft-logic-migration/reports/benchmarks/latest-summary.json',
  rollbackSummary:
    '.kiro/specs/raft-logic-migration/reports/rollback/latest-summary.json',
});

function parseArgs(argv) {
  let stage = STAGE.DEV;
  let benchmarkSummaryPath = DEFAULT_PATH.benchmarkSummary;
  let rollbackSummaryPath = DEFAULT_PATH.rollbackSummary;

  for (let i = LOCAL_NUM_ZERO; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === ARG.STAGE && i + LOCAL_NUM_ONE < argv.length) {
      stage = String(argv[++i] || STAGE.DEV).trim().toLowerCase();
      continue;
    }
    if (arg === ARG.BENCHMARK_SUMMARY && i + LOCAL_NUM_ONE < argv.length) {
      benchmarkSummaryPath = String(argv[++i] || DEFAULT_PATH.benchmarkSummary);
      continue;
    }
    if (arg === ARG.ROLLBACK_SUMMARY && i + LOCAL_NUM_ONE < argv.length) {
      rollbackSummaryPath = String(argv[++i] || DEFAULT_PATH.rollbackSummary);
    }
  }

  if (!STAGES.includes(stage)) {
    throw new Error(`invalid stage "${stage}", expected one of: ${STAGES.join(LOCAL_STR_128KJ)}`);
  }

  return {
    stage,
    benchmarkSummaryPath: resolve(benchmarkSummaryPath),
    rollbackSummaryPath: resolve(rollbackSummaryPath),
  };
}

function timestampTag(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, LOCAL_STR_HYPHEN);
}

function buildIncidents(benchmarkSummary) {
  const incidents = [];
  const profiles = Array.isArray(benchmarkSummary?.profiles) ?
    benchmarkSummary.profiles :
    [];

  for (const profile of profiles) {
    if (profile?.exitCode !== LOCAL_NUM_ZERO) {
      incidents.push({
        severity: LOCAL_STR_HIGH,
        type: LOCAL_STR_SCENARIO_FAILURE,
        profile: profile.profile || null,
        reportPath: profile.outputPath || null,
        detail: `scenario command exited with code ${profile.exitCode}`,
      });
    }
    if (profile?.benchmarkRegressionGate?.status === LOCAL_STR_FAILED) {
      incidents.push({
        severity: LOCAL_STR_HIGH,
        type: LOCAL_STR_1Y1O3,
        profile: profile.profile || null,
        reportPath: profile.outputPath || null,
        detail: profile?.benchmarkRegressionGate?.reason || LOCAL_STR_UNKNOWN,
      });
    }
  }

  return incidents;
}

function evaluateStage(stage, benchmarkSummary, rollbackSummary) {
  const incidents = buildIncidents(benchmarkSummary);
  const checks = [];

  const benchmarkPassed = benchmarkSummary?.overall?.passed === true;
  checks.push({
    check: LOCAL_STR_1XCQE,
    passed: benchmarkPassed,
    detail: benchmarkPassed ? LOCAL_STR_OK : LOCAL_STR_CN3IO,
  });

  const has3Node = Array.isArray(benchmarkSummary?.profiles) &&
    benchmarkSummary.profiles.some((entry) => entry.profile === 'benchmark-3node');
  const has5Node = Array.isArray(benchmarkSummary?.profiles) &&
    benchmarkSummary.profiles.some((entry) => entry.profile === 'benchmark-5node');
  checks.push({
    check: LOCAL_STR_ENJ8X,
    passed: has3Node && has5Node,
    detail: has3Node && has5Node ?
      LOCAL_STR_CQURS :
      LOCAL_STR_192AS,
  });

  if (stage !== STAGE.DEV) {
    const noHighIncidents = incidents.length === 0;
    checks.push({
      check: LOCAL_STR_NO_HIGH_INCIDENTS,
      passed: noHighIncidents,
      detail: noHighIncidents ?
        LOCAL_STR_I70OS :
        `${incidents.length} high-severity incident(s) detected`,
    });
  }

  if (stage === STAGE.LIMITED_PRODUCTION) {
    const rollbackPassed = rollbackSummary?.overall?.passed === true;
    checks.push({
      check: LOCAL_STR_1J8HJ,
      passed: rollbackPassed,
      detail: rollbackPassed ?
        LOCAL_STR_OZF4W :
        LOCAL_STR_NISIJ,
    });
  }

  const passed = checks.every((check) => check.passed === true);
  return {
    passed,
    checks,
    incidents,
  };
}

async function loadJsonOrNull(path) {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const benchmarkSummary = await loadJsonOrNull(args.benchmarkSummaryPath);
  if (!benchmarkSummary) {
    throw new Error(`unable to read benchmark summary at ${args.benchmarkSummaryPath}`);
  }
  const rollbackSummary = await loadJsonOrNull(args.rollbackSummaryPath);

  const evaluation = evaluateStage(
    args.stage,
    benchmarkSummary,
    rollbackSummary,
  );
  const stageReport = {
    generatedAt: new Date().toISOString(),
    stage: args.stage,
    benchmarkSummaryPath: args.benchmarkSummaryPath,
    rollbackSummaryPath: args.rollbackSummaryPath,
    benchmarkSummaryGeneratedAt: benchmarkSummary.generatedAt || null,
    rollbackSummaryGeneratedAt: rollbackSummary?.generatedAt || null,
    ...evaluation,
  };

  const outDir = resolve(DEFAULT_PATH.reportRoot);
  await mkdir(outDir, {recursive: true});
  const timestamp = timestampTag();
  const timestampedPath = join(outDir, `${args.stage}-${timestamp}.json`);
  const latestByStagePath = join(outDir, `latest-${args.stage}.json`);
  const latestPath = join(outDir, 'latest.json');

  await writeFile(timestampedPath, JSON.stringify(stageReport, null, LOCAL_NUM_TWO), LOCAL_STR_UTF8);
  await writeFile(latestByStagePath, JSON.stringify(stageReport, null, LOCAL_NUM_TWO), LOCAL_STR_UTF8);
  await writeFile(latestPath, JSON.stringify(stageReport, null, LOCAL_NUM_TWO), LOCAL_STR_UTF8);

  if (!stageReport.passed) {
    process.exitCode = LOCAL_NUM_ONE;
  }
}

main().catch((error) => {
  process.stderr.write(
    `raft migration stage gate failed: ${error.message}\n`,
  );
  process.exit(LOCAL_NUM_ONE);
});
