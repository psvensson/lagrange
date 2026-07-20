import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {scenarioHarnessProbe} from '../../scripts/solve/probes/scenario-harness.js';

function writeReport(
  dir,
  name,
  {ts, scenario, passed, priorityItems, failed, verdict, verdictReason},
) {
  fs.writeFileSync(
    path.join(dir, `${name}.report.json`),
    JSON.stringify({
      timestamp: ts,
      summary: {total: 1, passed: passed ? 1 : 0, failed},
      optimizationSummary: {totalPriorityItems: priorityItems},
      standardSummary: {
        scenarios: [{
          scenario,
          current: {
            passed,
            verdict: passed ? 'PASS' : (verdict || 'BLOCK_EVIDENCE_INCOMPLETE'),
            ...(verdictReason ? {verdictReason} : {}),
          },
        }],
      },
    }),
  );
}

const INCOMPLETE_REASON = 'execution_incomplete_or_metrics_missing';

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

  t.test('an incomplete run is an invalid sample => null metric, not a false 0', (t) => {
    const dir = tmp();
    // The run reports 0 outstanding items only because it never finished measuring.
    writeReport(dir, 'blocked', {ts: '2026-06-01T01:00:00Z', scenario: SC,
      passed: false, priorityItems: 0, failed: 0, verdictReason: INCOMPLETE_REASON});
    const r = scenarioHarnessProbe.measure({scenario: SC, reportDir: dir});
    t.equal(r.metric, null, 'blocked run does not read as metric 0');
    t.equal(r.invalidSample, true, 'flagged as an invalid sample');
    t.equal(r.done, false, 'an incomplete run can never be done');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('a harness-connectivity failure is an invalid sample => null metric', (t) => {
    const dir = tmp();
    // The harness could not reach the cluster (EHOSTUNREACH / admin API timeout). Any
    // metric it emits is noise from a broken harness, never a real measurement.
    writeReport(dir, 'dead-harness', {ts: '2026-06-01T01:00:00Z', scenario: SC,
      passed: false, priorityItems: 0, failed: 0,
      verdictReason: 'harness_connectivity_or_system_failure'});
    const r = scenarioHarnessProbe.measure({scenario: SC, reportDir: dir});
    t.equal(r.metric, null, 'dead-harness run does not read as metric 0');
    t.equal(r.invalidSample, true, 'flagged as an invalid sample');
    t.equal(r.done, false, 'a non-measuring run can never be done');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('a topology convergence block with a numeric metric is measured', (t) => {
    const dir = tmp();
    writeReport(dir, 'topology-blocked', {ts: '2026-06-01T01:00:00Z', scenario: SC,
      passed: false, priorityItems: 2, failed: 1,
      verdict: 'BLOCK_TOPOLOGY_CONVERGENCE',
      verdictReason: 'topology_progress_blocked'});
    const r = scenarioHarnessProbe.measure({scenario: SC, reportDir: dir});
    t.equal(r.metric, 2, 'topology block keeps the priority metric');
    t.equal(r.invalidSample, false, 'topology block is a measured sample');
    t.equal(r.done, false, 'a measured topology block still does not satisfy done');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('a harness-connectivity failure breaks the consecutive-green streak', (t) => {
    const dir = tmp();
    writeReport(dir, 'r1', {ts: '2026-06-01T01:00:00Z', scenario: SC,
      passed: true, priorityItems: 0, failed: 0});
    writeReport(dir, 'r2', {ts: '2026-06-01T02:00:00Z', scenario: SC,
      passed: true, priorityItems: 0, failed: 0});
    // newest run claims metric 0 but the harness never connected: it did not measure.
    writeReport(dir, 'r3', {ts: '2026-06-01T03:00:00Z', scenario: SC,
      passed: true, priorityItems: 0, failed: 0,
      verdictReason: 'harness_connectivity_or_system_failure'});
    const r = scenarioHarnessProbe.measure(
      {scenario: SC, reportDir: dir, consecutive: 3});
    t.equal(r.done, false, 'a dead-harness run within the window blocks done');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('a structurally missing metric breaks the consecutive-green streak', (t) => {
    const dir = tmp();
    writeReport(dir, 'r1', {ts: '2026-06-01T01:00:00Z', scenario: SC,
      passed: true, priorityItems: undefined, failed: undefined});
    writeReport(dir, 'r2', {ts: '2026-06-01T02:00:00Z', scenario: SC,
      passed: true, priorityItems: 0, failed: 0});
    writeReport(dir, 'r3', {ts: '2026-06-01T03:00:00Z', scenario: SC,
      passed: true, priorityItems: 0, failed: 0});
    const r = scenarioHarnessProbe.measure(
      {scenario: SC, reportDir: dir, consecutive: 3});
    t.equal(r.done, false, 'a missing metric within the window blocks done');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('an incomplete run breaks the consecutive-green streak', (t) => {
    const dir = tmp();
    writeReport(dir, 'r1', {ts: '2026-06-01T01:00:00Z', scenario: SC,
      passed: true, priorityItems: 0, failed: 0});
    writeReport(dir, 'r2', {ts: '2026-06-01T02:00:00Z', scenario: SC,
      passed: true, priorityItems: 0, failed: 0});
    // newest run is incomplete: even though it claims passed, it did not measure.
    writeReport(dir, 'r3', {ts: '2026-06-01T03:00:00Z', scenario: SC,
      passed: true, priorityItems: 0, failed: 0, verdictReason: INCOMPLETE_REASON});
    const r = scenarioHarnessProbe.measure(
      {scenario: SC, reportDir: dir, consecutive: 3});
    t.equal(r.done, false, 'a non-measuring run within the window blocks done');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });
});

// A node-exit run carries a topology/publication dominantReason that MASKS the crash; the
// probe surfaces it separately so the Solver treats the exit as its own blocker.
function writeNodeExitReport(dir, name, {ts, scenario, exits}) {
  fs.writeFileSync(
    path.join(dir, `${name}.report.json`),
    JSON.stringify({
      timestamp: ts,
      summary: {total: 1, passed: 0, failed: 1},
      optimizationSummary: {totalPriorityItems: 3},
      scenarios: [{
        scenario,
        passed: false,
        classification: exits ? 'unexpected_node_exit' : 'topology',
        ...(exits ? {unexpectedNodeExits: exits} : {}),
        details: {diagnostics: {failure: {dominantReason: 'publication_missing_active_node'}}},
      }],
    }),
  );
}

tap.test('scenario-harness surfaces an unexpected node exit as a distinct signal', (t) => {
  t.test('present when the run records an unexpected node exit', (t) => {
    const dir = tmp();
    writeNodeExitReport(dir, 'crash', {ts: '2026-06-01T01:00:00Z', scenario: SC,
      exits: [{nodeId: 'n-abc', role: 'joiner', exitCode: 1}]});
    const r = scenarioHarnessProbe.measure({scenario: SC, reportDir: dir});
    t.ok(r.nodeExit?.present, 'nodeExit is surfaced even though dominantReason is topology');
    t.equal(r.nodeExit.count, 1, 'counts the exits');
    t.same(r.nodeExit.nodes, ['n-abc'], 'names the exited node');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('absent on a normal failing run', (t) => {
    const dir = tmp();
    writeNodeExitReport(dir, 'ok', {ts: '2026-06-01T01:00:00Z', scenario: SC, exits: null});
    const r = scenarioHarnessProbe.measure({scenario: SC, reportDir: dir});
    t.equal(r.nodeExit, null, 'no node-exit signal on a run without an unexpected exit');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });
  t.end();
});

// Gate semantics: `consecutive` MEASURING passes — a non-measuring run inside
// the window is skipped (counts neither way), exactly as the live-repetitions
// runner treats its re-run slots and the epic defines thermally invalid runs.
tap.test('non-measuring runs are skipped by the consecutive window', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-skip-'));
  const SC = 'skip-window';
  function writeRun(name, ts, passed, nonMeasuring) {
    fs.writeFileSync(path.join(dir, `${name}.report.json`), JSON.stringify({
      timestamp: ts,
      summary: {total: 1, passed: passed ? 1 : 0, failed: passed ? 0 : 1},
      optimizationSummary: {totalPriorityItems: passed ? 0 : 1},
      scenarios: [{
        scenario: SC,
        passed,
        current: {
          passed,
          verdict: passed ? 'PASS' : 'FAIL',
          ...(nonMeasuring ?
            {verdictReason: 'host_scheduling_gap_budget_exceeded'} : {}),
        },
      }],
    }));
  }
  // Newest-first ordering by timestamp: pass, pass, INVALID, pass.
  writeRun('a', '2026-07-20T15:41:00Z', true, false);
  writeRun('b', '2026-07-20T15:33:00Z', true, false);
  writeRun('c', '2026-07-20T15:25:00Z', false, true);
  writeRun('d', '2026-07-20T15:10:00Z', true, false);
  const done3 = scenarioHarnessProbe.measure({
    reportDir: dir, scenario: SC, consecutive: 3, metric: 'priority',
  });
  t.equal(done3.done, true,
    'three measuring passes with one skipped invalid inside the window');

  // A measuring FAIL inside the window still breaks the streak.
  writeRun('c', '2026-07-20T15:25:00Z', false, false);
  const withFail = scenarioHarnessProbe.measure({
    reportDir: dir, scenario: SC, consecutive: 3, metric: 'priority',
  });
  t.equal(withFail.done, false, 'a measuring red is never skipped');
  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});
