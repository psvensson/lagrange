#!/usr/bin/env node

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';

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

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === ARG.STAGE && i + 1 < argv.length) {
      stage = String(argv[++i] || STAGE.DEV).trim().toLowerCase();
      continue;
    }
    if (arg === ARG.BENCHMARK_SUMMARY && i + 1 < argv.length) {
      benchmarkSummaryPath = String(argv[++i] || DEFAULT_PATH.benchmarkSummary);
      continue;
    }
    if (arg === ARG.ROLLBACK_SUMMARY && i + 1 < argv.length) {
      rollbackSummaryPath = String(argv[++i] || DEFAULT_PATH.rollbackSummary);
    }
  }

  if (!STAGES.includes(stage)) {
    throw new Error(`invalid stage "${stage}", expected one of: ${STAGES.join(', ')}`);
  }

  return {
    stage,
    benchmarkSummaryPath: resolve(benchmarkSummaryPath),
    rollbackSummaryPath: resolve(rollbackSummaryPath),
  };
}

function timestampTag(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function buildIncidents(benchmarkSummary) {
  const incidents = [];
  const profiles = Array.isArray(benchmarkSummary?.profiles) ?
    benchmarkSummary.profiles :
    [];

  for (const profile of profiles) {
    if (profile?.exitCode !== 0) {
      incidents.push({
        severity: 'high',
        type: 'scenario_failure',
        profile: profile.profile || null,
        reportPath: profile.outputPath || null,
        detail: `scenario command exited with code ${profile.exitCode}`,
      });
    }
    if (profile?.benchmarkRegressionGate?.status === 'failed') {
      incidents.push({
        severity: 'high',
        type: 'benchmark_regression_gate_failure',
        profile: profile.profile || null,
        reportPath: profile.outputPath || null,
        detail: profile?.benchmarkRegressionGate?.reason || 'unknown',
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
    check: 'benchmark_pipeline_passed',
    passed: benchmarkPassed,
    detail: benchmarkPassed ? 'ok' : 'benchmark pipeline did not pass',
  });

  const has3Node = Array.isArray(benchmarkSummary?.profiles) &&
    benchmarkSummary.profiles.some((entry) => entry.profile === 'benchmark-3node');
  const has5Node = Array.isArray(benchmarkSummary?.profiles) &&
    benchmarkSummary.profiles.some((entry) => entry.profile === 'benchmark-5node');
  checks.push({
    check: 'standard_profiles_present',
    passed: has3Node && has5Node,
    detail: has3Node && has5Node ?
      '3-node and 5-node benchmark reports present' :
      'missing standardized profile(s)',
  });

  if (stage !== STAGE.DEV) {
    const noHighIncidents = incidents.length === 0;
    checks.push({
      check: 'no_high_incidents',
      passed: noHighIncidents,
      detail: noHighIncidents ?
        'no high-severity incidents detected' :
        `${incidents.length} high-severity incident(s) detected`,
    });
  }

  if (stage === STAGE.LIMITED_PRODUCTION) {
    const rollbackPassed = rollbackSummary?.overall?.passed === true;
    checks.push({
      check: 'rollback_drill_passed',
      passed: rollbackPassed,
      detail: rollbackPassed ?
        'rollback drill summary passed' :
        'rollback drill summary missing or failed',
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

  await writeFile(timestampedPath, JSON.stringify(stageReport, null, 2), 'utf8');
  await writeFile(latestByStagePath, JSON.stringify(stageReport, null, 2), 'utf8');
  await writeFile(latestPath, JSON.stringify(stageReport, null, 2), 'utf8');

  if (!stageReport.passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(
    `raft migration stage gate failed: ${error.message}\n`,
  );
  process.exit(1);
});
