#!/usr/bin/env node
// @ts-nocheck

import {spawn} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';

const SCRIPT_DEFAULT = Object.freeze({
  scenario: 'postgres-baseline-comparison',
  raftProvider: 'liferaft',
  reportRootDir: '.kiro/specs/raft-logic-migration/reports/benchmarks',
  latestSummaryFilename: 'latest-summary.json',
});

const BENCHMARK_PROFILES = Object.freeze([
  Object.freeze({
    profile: 'benchmark-3node',
    configPath: 'test/distributed/config/local-benchmark-3node.json',
    reportFilename: 'benchmark-3node.report.json',
  }),
  Object.freeze({
    profile: 'benchmark-5node',
    configPath: 'test/distributed/config/local-benchmark-5node.json',
    reportFilename: 'benchmark-5node.report.json',
  }),
]);

const ARG = Object.freeze({
  SCENARIO: '--scenario',
  PROVIDER: '--provider',
  MITIGATION: '--mitigation-id',
});

function parseArgs(argv) {
  let scenario = SCRIPT_DEFAULT.scenario;
  let raftProvider = SCRIPT_DEFAULT.raftProvider;
  let mitigationId = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === ARG.SCENARIO && i + 1 < argv.length) {
      scenario = String(argv[++i] || SCRIPT_DEFAULT.scenario);
      continue;
    }
    if (arg === ARG.PROVIDER && i + 1 < argv.length) {
      raftProvider = String(argv[++i] || SCRIPT_DEFAULT.raftProvider)
        .trim()
        .toLowerCase();
      continue;
    }
    if (arg === ARG.MITIGATION && i + 1 < argv.length) {
      const value = String(argv[++i] || '').trim();
      mitigationId = value.length > 0 ? value : null;
    }
  }

  return {
    scenario,
    raftProvider: raftProvider || SCRIPT_DEFAULT.raftProvider,
    mitigationId,
  };
}

function timestampTag(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function runCommand(command, args, env) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env,
      },
      stdio: 'inherit',
    });

    child.once('error', (error) => {
      rejectRun(error);
    });
    child.once('close', (code) => {
      resolveRun(Number(code || 0));
    });
  });
}

async function runProfile(options) {
  const args = [
    'test/distributed/run.js',
    '--config',
    options.configPath,
    '--scenario',
    options.scenario,
    '--output',
    options.outputPath,
    '--verbose',
  ];

  const commandExitCode = await runCommand('node', args, {
    RAFT_PROVIDER: options.raftProvider,
  });
  const rawReport = await readFile(options.outputPath, 'utf8');
  const report = JSON.parse(rawReport);
  return {
    profile: options.profile,
    configPath: options.configPath,
    outputPath: options.outputPath,
    exitCode: commandExitCode,
    summary: report.summary || null,
    standardSummary: report.standardSummary || null,
    benchmarkRegressionGate: report.benchmarkRegressionGate || null,
  };
}

function buildRunSummary(runOptions, reportDir, profileResults) {
  const failureCount = profileResults.filter((entry) => entry.exitCode !== 0)
    .length;
  const gateFailureCount = profileResults.filter((entry) =>
    entry?.benchmarkRegressionGate?.status === 'failed')
    .length;

  return {
    generatedAt: new Date().toISOString(),
    scenario: runOptions.scenario,
    raftProvider: runOptions.raftProvider,
    mitigationId: runOptions.mitigationId,
    reportDir,
    profiles: profileResults,
    overall: {
      profileCount: profileResults.length,
      commandFailureCount: failureCount,
      gateFailureCount,
      passed: failureCount === 0 && gateFailureCount === 0,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runTag = timestampTag();
  const reportDir = resolve(
    join(SCRIPT_DEFAULT.reportRootDir, runTag),
  );
  await mkdir(reportDir, {recursive: true});

  const profileResults = [];
  for (const profile of BENCHMARK_PROFILES) {
    const outputPath = join(reportDir, profile.reportFilename);
    const configPath = profile.configPath;
    if (args.mitigationId) {
      const overrideConfigPath = join(
        reportDir,
        `${profile.profile}.override-config.json`,
      );
      const baseConfig = JSON.parse(await readFile(resolve(configPath), 'utf8'));
      baseConfig.benchmarkGate = {
        ...(baseConfig.benchmarkGate || {}),
        approvedMitigationId: args.mitigationId,
      };
      await writeFile(
        overrideConfigPath,
        JSON.stringify(baseConfig, null, 2),
        'utf8',
      );
      profileResults.push(await runProfile({
        profile: profile.profile,
        configPath: overrideConfigPath,
        scenario: args.scenario,
        outputPath,
        raftProvider: args.raftProvider,
      }));
      continue;
    }

    profileResults.push(await runProfile({
      profile: profile.profile,
      configPath,
      scenario: args.scenario,
      outputPath,
      raftProvider: args.raftProvider,
    }));
  }

  const runSummary = buildRunSummary(args, reportDir, profileResults);
  const timestampedSummaryPath = join(reportDir, 'benchmark-summary.json');
  const latestSummaryPath = resolve(
    join(SCRIPT_DEFAULT.reportRootDir, SCRIPT_DEFAULT.latestSummaryFilename),
  );

  await writeFile(
    timestampedSummaryPath,
    JSON.stringify(runSummary, null, 2),
    'utf8',
  );
  await mkdir(resolve(SCRIPT_DEFAULT.reportRootDir), {recursive: true});
  await writeFile(
    latestSummaryPath,
    JSON.stringify(runSummary, null, 2),
    'utf8',
  );

  if (!runSummary.overall.passed) {
    process.exitCode = 1;
    return;
  }
}

main().catch((error) => {
  process.stderr.write(
    `raft migration benchmark pipeline failed: ${error.message}\n`,
  );
  process.exit(1);
});
