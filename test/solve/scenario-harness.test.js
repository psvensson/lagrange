import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {scenarioHarnessProbe} from '../../scripts/solve/probes/scenario-harness.js';

function writeReport(dir, name, {ts, scenario, passed, priorityItems, failed}) {
  fs.writeFileSync(
    path.join(dir, `${name}.report.json`),
    JSON.stringify({
      timestamp: ts,
      summary: {total: 1, passed: passed ? 1 : 0, failed},
      optimizationSummary: {totalPriorityItems: priorityItems},
      standardSummary: {
        scenarios: [{
          scenario,
          current: {passed, verdict: passed ? 'PASS' : 'BLOCK_EVIDENCE_INCOMPLETE'},
        }],
      },
    }),
  );
}

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'probe-'));
}

const SC = 'rolling-restart';

tap.test('scenario-harness probe (P1)', async (t) => {
  t.test('no reports => null metric, not done', (t) => {
    const dir = tmp();
    const r = scenarioHarnessProbe.measure({scenario: SC, reportDir: dir});
    t.equal(r.metric, null);
    t.equal(r.done, false);
    t.equal(r.evidence, null);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('metric is the priority-item gradient, independent of pass/fail', (t) => {
    const dir = tmp();
    writeReport(dir, 'a', {ts: '2026-06-01T01:00:00Z', scenario: SC,
      passed: false, priorityItems: 3, failed: 1});
    const r = scenarioHarnessProbe.measure({scenario: SC, reportDir: dir});
    t.equal(r.metric, 3, 'metric reflects outstanding priority items');
    t.equal(r.done, false, 'failing scenario is not done');
    t.ok(r.evidence.endsWith('a.report.json'));
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('latest run by timestamp drives the metric', (t) => {
    const dir = tmp();
    writeReport(dir, 'old', {ts: '2026-06-01T01:00:00Z', scenario: SC,
      passed: false, priorityItems: 5, failed: 1});
    writeReport(dir, 'new', {ts: '2026-06-01T05:00:00Z', scenario: SC,
      passed: false, priorityItems: 2, failed: 1});
    const r = scenarioHarnessProbe.measure({scenario: SC, reportDir: dir});
    t.equal(r.metric, 2, 'uses most-recent report');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('done requires consecutive distinct passing runs', (t) => {
    const dir = tmp();
    writeReport(dir, 'r1', {ts: '2026-06-01T01:00:00Z', scenario: SC,
      passed: true, priorityItems: 0, failed: 0});
    writeReport(dir, 'r2', {ts: '2026-06-01T02:00:00Z', scenario: SC,
      passed: false, priorityItems: 1, failed: 1});
    writeReport(dir, 'r3', {ts: '2026-06-01T03:00:00Z', scenario: SC,
      passed: true, priorityItems: 0, failed: 0});
    // newest two are r3(pass), r2(fail) => not 2-consecutive green
    t.equal(
      scenarioHarnessProbe.measure({scenario: SC, reportDir: dir, consecutive: 2}).done,
      false, 'a failure within the window blocks done',
    );
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('done is true with enough consecutive green runs', (t) => {
    const dir = tmp();
    writeReport(dir, 'r1', {ts: '2026-06-01T01:00:00Z', scenario: SC,
      passed: true, priorityItems: 0, failed: 0});
    writeReport(dir, 'r2', {ts: '2026-06-01T02:00:00Z', scenario: SC,
      passed: true, priorityItems: 0, failed: 0});
    writeReport(dir, 'r3', {ts: '2026-06-01T03:00:00Z', scenario: SC,
      passed: true, priorityItems: 0, failed: 0});
    const r = scenarioHarnessProbe.measure(
      {scenario: SC, reportDir: dir, consecutive: 3});
    t.equal(r.done, true, '3 consecutive green => done');
    t.equal(r.metric, 0, 'solved metric is 0');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('not enough runs for the consecutive window => not done', (t) => {
    const dir = tmp();
    writeReport(dir, 'r1', {ts: '2026-06-01T01:00:00Z', scenario: SC,
      passed: true, priorityItems: 0, failed: 0});
    const r = scenarioHarnessProbe.measure(
      {scenario: SC, reportDir: dir, consecutive: 3});
    t.equal(r.done, false, 'one green run cannot satisfy consecutive=3');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('reports without the scenario are ignored', (t) => {
    const dir = tmp();
    writeReport(dir, 'other', {ts: '2026-06-01T09:00:00Z', scenario: 'node-failure',
      passed: false, priorityItems: 9, failed: 1});
    writeReport(dir, 'ours', {ts: '2026-06-01T01:00:00Z', scenario: SC,
      passed: false, priorityItems: 4, failed: 1});
    const r = scenarioHarnessProbe.measure({scenario: SC, reportDir: dir});
    t.equal(r.metric, 4, 'ignores reports for other scenarios');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('failed-count metric mode', (t) => {
    const dir = tmp();
    writeReport(dir, 'a', {ts: '2026-06-01T01:00:00Z', scenario: SC,
      passed: false, priorityItems: 3, failed: 1});
    const r = scenarioHarnessProbe.measure(
      {scenario: SC, reportDir: dir, metric: 'failed'});
    t.equal(r.metric, 1, 'failed mode returns summary.failed');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });
});
