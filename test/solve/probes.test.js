// v2 probes: each answers metric/target/done/measuring; a probe that cannot
// measure is never done.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {PROBE} from '../../scripts/solve/schema.js';
import {
  NON_MEASURING_VERDICT_REASONS, PROBE_REASON, measure, reportSampleIsNonMeasuring,
} from '../../scripts/solve/probes.js';

const ORACLE = 'oracle.json';
const RECEIPT = 'receipt.json';
const RECEIPT_SCHEMA = 'test-receipt/1';
const R1 = 'r1';
const R2 = 'r2';
const SCENARIO = 'demo-scenario';
const REPORTS = 'test-output/reports';
const CHECK_SCRIPT = 'scripts/checks/demo-metric.js';
const OUTSIDE_SCRIPT = 'scripts/demo-metric.js';
const PASS = 'pass';
const FAIL = 'fail';

function root(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'solve-v2-probes-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return dir;
}

function write(dir, relative, content) {
  const file = path.join(dir, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
}

test('oracle: metric and target from the file; missing file cannot measure', (t) => {
  const dir = root(t);
  const missing = measure(dir, {probe: PROBE.ORACLE, args: {file: ORACLE}});
  assert.equal(missing.measuring, false);
  assert.equal(missing.done, false);
  write(dir, ORACLE, {metric: 2, target: 1});
  const red = measure(dir, {probe: PROBE.ORACLE, args: {file: ORACLE}});
  assert.deepEqual([red.metric, red.target, red.done, red.measuring], [2, 1, false, true]);
  write(dir, ORACLE, {metric: 0});
  assert.equal(measure(dir, {probe: PROBE.ORACLE, args: {file: ORACLE}}).done, true);
});

test('test-receipt: outstanding required receipts is the metric', (t) => {
  const dir = root(t);
  const args = {file: RECEIPT, requiredReceipts: [R1, R2]};
  assert.equal(measure(dir, {probe: PROBE.TEST_RECEIPT, args}).reason,
    PROBE_REASON.RECEIPT_MISSING);
  write(dir, RECEIPT, {schema: RECEIPT_SCHEMA, status: FAIL,
    receipts: [{id: R1, passed: true}, {id: R2, passed: false}]});
  const partial = measure(dir, {probe: PROBE.TEST_RECEIPT, args});
  assert.deepEqual([partial.metric, partial.done, partial.outstanding], [1, false, [R2]]);
  write(dir, RECEIPT, {schema: RECEIPT_SCHEMA, status: PASS,
    receipts: [{id: R1, passed: true}, {id: R2, passed: true}]});
  assert.equal(measure(dir, {probe: PROBE.TEST_RECEIPT, args}).done, true);
  assert.equal(measure(dir, {probe: PROBE.TEST_RECEIPT, args: {file: RECEIPT}}).reason,
    PROBE_REASON.REQUIRED_MISSING);
});

function report(passed, extra = {}, timestamp = '') {
  return {timestamp, summary: {failed: passed ? 0 : 1},
    optimizationSummary: {totalPriorityItems: passed ? 0 : 1},
    standardSummary: {scenarios: [{scenario: SCENARIO, passed, current: extra}]}};
}

test('scenario-harness: a streak of passing reports; non-measuring samples skip', (t) => {
  const dir = root(t);
  const args = {scenario: SCENARIO, consecutive: 2};
  assert.equal(measure(dir, {probe: PROBE.SCENARIO_HARNESS, args}).measuring, false);
  write(dir, `${REPORTS}/a.report.json`, report(false, {}, '2026-01-01T00:00:00Z'));
  write(dir, `${REPORTS}/b.report.json`, report(true, {}, '2026-01-02T00:00:00Z'));
  const one = measure(dir, {probe: PROBE.SCENARIO_HARNESS, args});
  assert.deepEqual([one.metric, one.done, one.detail.passingStreak, one.detail.runs],
    [0, false, 1, 2]);
  write(dir, `${REPORTS}/c.report.json`, report(true, {}, '2026-01-03T00:00:00Z'));
  assert.equal(measure(dir, {probe: PROBE.SCENARIO_HARNESS, args}).done, true);
  const gap = `${REPORTS}/${SCENARIO}-2026-01-04.report.json`;
  write(dir, gap, report(false, {verdictReason: NON_MEASURING_VERDICT_REASONS[0]},
    '2026-01-04T00:00:00Z'));
  const latest = measure(dir, {probe: PROBE.SCENARIO_HARNESS, args});
  assert.equal(latest.measuring, false, 'the newest sample is non-measuring');
  assert.equal(reportSampleIsNonMeasuring(path.join(dir, gap), {scenario: SCENARIO}), true);
  assert.equal(reportSampleIsNonMeasuring(
    path.join(dir, `${REPORTS}/c.report.json`), {scenario: SCENARIO}), false);
  const unsupported = measure(dir, {probe: PROBE.SCENARIO_HARNESS,
    args: {scenario: SCENARIO, metric: 'sealed-bar'}});
  assert.equal(unsupported.measuring, false);
  assert.match(unsupported.reason, /sealed-bar/u);
});

test('script: only scripts/checks; exit code and the last numeric line', (t) => {
  const dir = root(t);
  const outside = measure(dir, {probe: PROBE.SCRIPT, args: {command: `node ${OUTSIDE_SCRIPT}`}});
  assert.equal(outside.reason, PROBE_REASON.SCRIPT_OUTSIDE_CHECKS);
  write(dir, CHECK_SCRIPT, 'process.stdout.write("noise\\n3\\n"); process.exitCode = 1;\n');
  const red = measure(dir, {probe: PROBE.SCRIPT, args: {command: CHECK_SCRIPT}});
  assert.deepEqual([red.metric, red.done, red.exitCode], [3, false, 1]);
  write(dir, CHECK_SCRIPT, 'process.stdout.write("0\\n");\n');
  assert.equal(measure(dir, {probe: PROBE.SCRIPT, args: {command: CHECK_SCRIPT}}).done, true);
  assert.equal(measure(dir, {probe: PROBE.SCRIPT, args: {command: `node ${CHECK_SCRIPT}`}}).done,
    true, 'a leading node token is accepted');
  write(dir, CHECK_SCRIPT, 'process.stdout.write("0\\n"); process.exitCode = 2;\n');
  assert.equal(measure(dir, {probe: PROBE.SCRIPT, args: {command: CHECK_SCRIPT}}).done, false,
    'a red exit code is never done');
  write(dir, CHECK_SCRIPT, 'process.stdout.write("words only\\n");\n');
  assert.equal(measure(dir, {probe: PROBE.SCRIPT, args: {command: CHECK_SCRIPT}}).reason,
    PROBE_REASON.SCRIPT_NO_METRIC);
  assert.equal(measure(dir, {probe: 'nope', args: {}}).measuring, false);
});
