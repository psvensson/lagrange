// Deterministic witnesses for the model-report-deterministic-output-tail
// quest: the TLC *.model.report.json writer (scripts/model-tlc.js, tail owner
// scripts/model-tlc-output-tail.js, constants scripts/model-tlc-constants.js)
// must render byte-identical report content
// for two runs whose model outcome is unchanged, even though raw TLC output
// differs between runs (wall-clock stamps, fingerprint seed and pid, absolute
// parse paths, a per-run trace-exploration file). The versioned evidence copy
// under architecture/contracts/evidence/ is refreshed by that writer, so a
// run-dependent tail dirties a clean checkout and the release-gate receipt
// records treeCleanAtFinish:false.
//
// The file uses raw node:test so each top-level scenario is independently
// selectable with --test-name-pattern by the quest evidence harness.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {CONFIGS} from '../../scripts/model-tlc-configs.js';
import {renderTlcReport} from '../../scripts/model-tlc.js';
import {
  TLC_NO_ERROR_VERDICT,
  TLC_OUTPUT_TAIL_LINE_LIMIT,
} from '../../scripts/model-tlc-constants.js';

const ROUTE_MODE = 'route';
const STALL_MODE = 'stall';
const NEWLINE = '\n';
const UTF8_ENCODING = 'utf8';
const EXIT_OK = 0;
const TLC_TEMPORAL_VIOLATION_EXIT = 13;
const JSON_INDENT = 2;
const RUNNER_PATH = path.resolve('scripts', 'model-tlc.js');
const MODELS_DIR = path.resolve('models');
const MODELS_LINK_NAME = 'models';
const TEST_OUTPUT_REPORTS = path.join('test-output', 'reports');
const FIXTURE_PREFIX = 'model-tlc-output-tail-';
const FAKE_JAVA_NAME = 'java';
const FAKE_JAR_NAME = 'tla2tools.jar';
const FAKE_JAR_BYTES = 'fixture';
const FAKE_OUTPUT_ENV = 'MODEL_TLC_FAKE_OUTPUT';
const EXECUTABLE_MODE = 0o755;
const MODE_ARGUMENT = '--mode';
const ABSOLUTE_PATH_PREFIX = '/';
const WALL_CLOCK_PATTERN = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/u;
const TRACE_EXPLORATION_MARKER = 'Trace exploration spec path';
const COUNTEREXAMPLE_CYCLE_LINE = 'Back to state 6: <ReconcileOwner(n1) ' +
  'line 47, col 3 to line 49, col 46 of module ActiveGate>';
const NO_ERROR_LINE = `Model checking completed. ${TLC_NO_ERROR_VERDICT}.`;
const JAVA_SOURCE =
  '#!/usr/bin/env node\n' +
  `process.stdout.write(process.env.${FAKE_OUTPUT_ENV});\n`;

// Two runs of the same model differing in every run-dependent value TLC
// prints; the model outcome (state space, verdict) is identical.
const RUN_A = Object.freeze({
  stamp: '2026-08-30 13:50:17',
  seed: '3598982685738492974',
  pid: '1467606',
  checkout: '/mnt/data/checkout-a',
  scratch: '/tmp/tlc-2819781845880894421',
  epoch: '1788090637',
  estimate: '8.7E-18',
});
const RUN_B = Object.freeze({
  stamp: '2026-08-31 09:02:41',
  seed: '3036148592524601088',
  pid: '1467771',
  checkout: '/home/other/checkout-b',
  scratch: '/tmp/tlc-3563113518429954894',
  epoch: '1788098459',
  estimate: '1.2E-17',
});
const RUN_VALUE_KEYS = Object.freeze(Object.keys(RUN_A));

function preambleLines(run) {
  return [
    'TLC2 Version 2026.07.18.145032 (rev: 30cc360)',
    'Running breadth-first search Model-Checking with fp 50 and seed ' +
      `${run.seed} with 1 worker on 20 cores with 7976MB heap and 64MB ` +
      `offheap memory [pid: ${run.pid}] (Linux 5.15.0-190-generic amd64, ` +
      'Ubuntu 11.0.32 64bit, MSBDiskFPSet, DiskStateQueue).',
    `Parsing file ${run.checkout}/models/active-gate/ActiveGate.tla`,
    `Parsing file ${run.scratch}/Naturals.tla (jar:file:${run.checkout}` +
      '/tools/tla2tools.jar!/tla2sany/StandardModules/Naturals.tla)',
    'Semantic processing of module Naturals',
    'Semantic processing of module ActiveGate',
    'Linting of module ActiveGate',
    `Starting... (${run.stamp})`,
    'Implied-temporal checking--satisfiability problem has 1 branches.',
    'Computing initial states...',
    'Finished computing initial states: 1 distinct state generated at ' +
      `${run.stamp}.`,
  ];
}

function successOutput(run) {
  return [
    ...preambleLines(run),
    `Progress(7) at ${run.stamp}: 26 states generated, 16 distinct states ` +
      'found, 0 states left on queue.',
    'Checking temporal properties for the complete state space with 16 ' +
      `total distinct states at (${run.stamp})`,
    `Finished checking temporal properties in 00s at ${run.stamp}`,
    NO_ERROR_LINE,
    '  Estimates of the probability that TLC did not check all reachable ' +
      'states',
    '  because two distinct states had the same fingerprint:',
    `  calculated (optimistic):  val = ${run.estimate}`,
    '26 states generated, 16 distinct states found, 0 states left on queue.',
    'The depth of the complete state graph search is 7.',
    'The average outdegree of the complete state graph is 1 (minimum is 0, ' +
      'the maximum 2 and the 95th percentile is 2).',
    `Finished in 00s at (${run.stamp})`,
  ].join(NEWLINE) + NEWLINE;
}

function failureOutput(run) {
  return [
    ...preambleLines(run),
    `Progress(8) at ${run.stamp}: 114 states generated, 32 distinct states ` +
      'found, 0 states left on queue.',
    'Checking temporal properties for the complete state space with 32 ' +
      `total distinct states at (${run.stamp})`,
    'Error: Temporal property EventuallyConverged was violated.',
    '',
    'Error: The following behavior constitutes a counter-example:',
    '',
    'State 1: <Initial predicate>',
    '/\\ pending = {n1, n2}',
    '/\\ covered = {}',
    '/\\ published = {}',
    '/\\ fresh = TRUE',
    '',
    'State 9: <StaleEvent line 79, col 3 to line 82, col 48 of module ' +
      'ActiveGate>',
    '/\\ pending = {n1}',
    '/\\ covered = {n2}',
    '/\\ published = {n2}',
    '/\\ fresh = FALSE',
    '',
    COUNTEREXAMPLE_CYCLE_LINE,
    '',
    `Finished checking temporal properties in 00s at ${run.stamp}`,
    '114 states generated, 32 distinct states found, 0 states left on queue.',
    'The depth of the complete state graph search is 8.',
    `Finished in 00s at (${run.stamp})`,
    `${TRACE_EXPLORATION_MARKER}: models/active-gate/` +
      `ActiveGate_TTrace_${run.epoch}.tla`,
  ].join(NEWLINE) + NEWLINE;
}

function configForMode(mode) {
  return CONFIGS.find((config) => config.mode === mode);
}

function renderJson(config, run) {
  return JSON.stringify(renderTlcReport(config, run).report, null, JSON_INDENT);
}

function assertNoRunValues(text, label) {
  for (const run of [RUN_A, RUN_B]) {
    for (const key of RUN_VALUE_KEYS) {
      assert.equal(text.includes(run[key]), false,
        `${label} must not embed run-dependent ${key} ${run[key]}`);
    }
  }
  assert.equal(WALL_CLOCK_PATTERN.test(text), false,
    `${label} must not embed a wall-clock stamp`);
}

test('success-report-stable-across-timestamps', () => {
  const config = configForMode(ROUTE_MODE);
  const fromRunA = renderJson(config, {exitCode: EXIT_OK,
    output: successOutput(RUN_A)});
  const fromRunB = renderJson(config, {exitCode: EXIT_OK,
    output: successOutput(RUN_B)});
  const verdictOnly = renderJson(config, {exitCode: EXIT_OK,
    output: `${NO_ERROR_LINE}${NEWLINE}`});
  assert.equal(fromRunA, fromRunB,
    'two converged runs with different stamps render identical reports');
  assert.equal(fromRunA, verdictOnly,
    'progress and timestamp lines contribute nothing to a converged report');
  const report = JSON.parse(fromRunA);
  assert.equal(report.outputTail, TLC_NO_ERROR_VERDICT);
  assert.equal(report.converged, true);
  assert.equal(report.expectationMet, true);
});

test('failure-tail-bounded-and-timestamp-free', () => {
  const config = configForMode(STALL_MODE);
  const fromRunA = renderJson(config, {exitCode: TLC_TEMPORAL_VIOLATION_EXIT,
    output: failureOutput(RUN_A)});
  const fromRunB = renderJson(config, {exitCode: TLC_TEMPORAL_VIOLATION_EXIT,
    output: failureOutput(RUN_B)});
  assert.equal(fromRunA, fromRunB,
    'two non-converged runs with the same counterexample render identically');
  const report = JSON.parse(fromRunA);
  const tailLines = report.outputTail.split(NEWLINE);
  assert.ok(tailLines.length <= TLC_OUTPUT_TAIL_LINE_LIMIT,
    `failure tail stays within ${TLC_OUTPUT_TAIL_LINE_LIMIT} lines`);
  assert.ok(tailLines.includes(COUNTEREXAMPLE_CYCLE_LINE),
    'failure tail keeps the deterministic counterexample content');
  assert.equal(report.outputTail.includes(TRACE_EXPLORATION_MARKER), false,
    'failure tail drops the per-run trace-exploration path');
  assertNoRunValues(report.outputTail, 'failure tail');
  assert.equal(report.converged, false);
  assert.equal(report.temporalViolated, true);
  assert.equal(report.expectedFailureObserved, true);
  assert.equal(report.expectationMet, true);
});

test('report-fields-run-independent', () => {
  const rendered = [
    renderJson(configForMode(ROUTE_MODE),
      {exitCode: EXIT_OK, output: successOutput(RUN_A)}),
    renderJson(configForMode(STALL_MODE),
      {exitCode: TLC_TEMPORAL_VIOLATION_EXIT, output: failureOutput(RUN_B)}),
  ];
  for (const json of rendered) {
    assertNoRunValues(json, 'report');
    const report = JSON.parse(json);
    assert.equal(report.module.startsWith(ABSOLUTE_PATH_PREFIX), false,
      'module path is checkout-relative');
    assert.equal(report.config.startsWith(ABSOLUTE_PATH_PREFIX), false,
      'config path is checkout-relative');
  }
});

function createCliFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE_PREFIX));
  const bin = path.join(root, 'bin');
  const java = path.join(bin, FAKE_JAVA_NAME);
  const jar = path.join(root, FAKE_JAR_NAME);
  fs.mkdirSync(bin, {recursive: true});
  fs.writeFileSync(java, JAVA_SOURCE);
  fs.chmodSync(java, EXECUTABLE_MODE);
  fs.writeFileSync(jar, FAKE_JAR_BYTES);
  fs.symlinkSync(MODELS_DIR, path.join(root, MODELS_LINK_NAME));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  return {root, bin, jar};
}

function runCliWithOutput(fixture, output) {
  return spawnSync(process.execPath, [RUNNER_PATH, MODE_ARGUMENT, ROUTE_MODE], {
    cwd: fixture.root,
    encoding: UTF8_ENCODING,
    env: {
      ...process.env,
      TLA_TOOLS_JAR: fixture.jar,
      [FAKE_OUTPUT_ENV]: output,
      PATH: `${fixture.bin}${path.delimiter}${process.env.PATH}`,
    },
  });
}

test('cli-writes-byte-identical-report-across-runs', (t) => {
  const fixture = createCliFixture(t);
  const reportPath = path.join(fixture.root, TEST_OUTPUT_REPORTS,
    configForMode(ROUTE_MODE).report);
  const first = runCliWithOutput(fixture, successOutput(RUN_A));
  assert.equal(first.status, EXIT_OK, first.stderr || first.stdout);
  const firstBytes = fs.readFileSync(reportPath, UTF8_ENCODING);
  const second = runCliWithOutput(fixture, successOutput(RUN_B));
  assert.equal(second.status, EXIT_OK, second.stderr || second.stdout);
  const secondBytes = fs.readFileSync(reportPath, UTF8_ENCODING);
  assert.equal(firstBytes, secondBytes,
    'the writer emits byte-identical report files across two runs');
  assertNoRunValues(firstBytes, 'written report');
});
