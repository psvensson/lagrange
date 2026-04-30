#!/usr/bin/env node

import {spawn} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';

const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_HYPHEN = '-';
const LOCAL_STR_ERROR = 'error';
const LOCAL_STR_CLOSE = 'close';
const LOCAL_NUM_TWO = 2;
const LOCAL_STR_UTF8 = 'utf8';

const SCRIPT_DEFAULT = Object.freeze({
  scenario: 'rolling-restart',
  raftProvider: 'liferaft',
  reportRoot: '.kiro/specs/raft-logic-migration/reports/rollback',
});

const DRILL_PROFILES = Object.freeze([
  Object.freeze({
    profile: 'canary-3node',
    configPath: 'test/distributed/config/local-three-node.json',
    reportFilename: 'rollback-canary-3node.report.json',
  }),
  Object.freeze({
    profile: 'limited-production-5node',
    configPath: 'test/distributed/config/local.json',
    reportFilename: 'rollback-limited-5node.report.json',
  }),
]);

const ARG_PROVIDER = '--provider';

function parseArgs(argv) {
  let raftProvider = SCRIPT_DEFAULT.raftProvider;
  for (let i = LOCAL_NUM_ZERO; i < argv.length; i++) {
    if (argv[i] === ARG_PROVIDER && i + LOCAL_NUM_ONE < argv.length) {
      raftProvider = String(argv[++i] || SCRIPT_DEFAULT.raftProvider)
        .trim()
        .toLowerCase();
    }
  }
  return {
    raftProvider: raftProvider || SCRIPT_DEFAULT.raftProvider,
  };
}

function timestampTag(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, LOCAL_STR_HYPHEN);
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

    child.once(LOCAL_STR_ERROR, (error) => {
      rejectRun(error);
    });
    child.once(LOCAL_STR_CLOSE, (code) => {
      resolveRun(Number(code || LOCAL_NUM_ZERO));
    });
  });
}

async function runDrillProfile(options) {
  const args = [
    'test/distributed/run.js',
    '--config',
    options.configPath,
    '--scenario',
    SCRIPT_DEFAULT.scenario,
    '--output',
    options.outputPath,
    '--verbose',
  ];

  const exitCode = await runCommand('node', args, {
    RAFT_PROVIDER: options.raftProvider,
  });
  const report = JSON.parse(await readFile(options.outputPath, 'utf8'));
  const scenario = Array.isArray(report?.scenarios) && report.scenarios.length > 0 ?
    report.scenarios[0] :
    null;
  return {
    profile: options.profile,
    configPath: options.configPath,
    outputPath: options.outputPath,
    exitCode,
    passed: scenario?.passed === true && exitCode === LOCAL_NUM_ZERO,
    scenario: scenario?.scenario || null,
    recoveryTimingMs: Number(scenario?.duration || LOCAL_NUM_ZERO),
    error: scenario?.error || null,
  };
}

function buildSummary(runTag, raftProvider, results, reportDir) {
  const failedProfiles = results.filter((result) => result.passed !== true);
  return {
    generatedAt: new Date().toISOString(),
    runTag,
    raftProvider,
    scenario: SCRIPT_DEFAULT.scenario,
    reportDir,
    profiles: results,
    overall: {
      profileCount: results.length,
      failedProfileCount: failedProfiles.length,
      passed: failedProfiles.length === LOCAL_NUM_ZERO,
      maxRecoveryTimingMs: results.reduce((max, result) =>
        Math.max(max, Number(result.recoveryTimingMs || LOCAL_NUM_ZERO)), LOCAL_NUM_ZERO),
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runTag = timestampTag();
  const runDir = resolve(join(SCRIPT_DEFAULT.reportRoot, runTag));
  await mkdir(runDir, {recursive: true});

  const results = [];
  for (const profile of DRILL_PROFILES) {
    results.push(await runDrillProfile({
      profile: profile.profile,
      configPath: profile.configPath,
      outputPath: join(runDir, profile.reportFilename),
      raftProvider: args.raftProvider,
    }));
  }

  const summary = buildSummary(
    runTag,
    args.raftProvider,
    results,
    runDir,
  );
  const summaryPath = join(runDir, 'rollback-summary.json');
  const latestPath = resolve(join(SCRIPT_DEFAULT.reportRoot, 'latest-summary.json'));

  await writeFile(summaryPath, JSON.stringify(summary, null, LOCAL_NUM_TWO), LOCAL_STR_UTF8);
  await mkdir(resolve(SCRIPT_DEFAULT.reportRoot), {recursive: true});
  await writeFile(latestPath, JSON.stringify(summary, null, LOCAL_NUM_TWO), LOCAL_STR_UTF8);

  if (!summary.overall.passed) {
    process.exitCode = LOCAL_NUM_ONE;
  }
}

main().catch((error) => {
  process.stderr.write(
    `raft migration rollback drill failed: ${error.message}\n`,
  );
  process.exit(LOCAL_NUM_ONE);
});
